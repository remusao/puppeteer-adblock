const puppeteer = require("puppeteer");
const fetch = require("isomorphic-unfetch");
const { Request, ENGINE_VERSION, FiltersEngine } = require("@cliqz/adblocker");

async function loadAdblocker() {
  // Fetch `allowed-lists.json` from CDN. It contains information about where
  // to find pre-built engines as well as lists of filters (e.g.: Easylist,
  // etc.).
  console.time("fetch allowed lists");
  const { engines } = await (await fetch(
    "https://cdn.cliqz.com/adblocker/configs/desktop-ads-trackers/allowed-lists.json"
  )).json();
  console.timeEnd("fetch allowed lists");

  // Once we have the config, we can get the URL of the pre-built engine
  // corresponding to our installed @cliqz/adblocker version (i.e.:
  // ENGINE_VERSION). This guarantees that we can download a compabitle one.
  console.time("fetch serialized engine");
  const serialized = await (await fetch(
    engines[ENGINE_VERSION].url
  )).arrayBuffer();
  console.timeEnd("fetch serialized engine");

  // Deserialize the FiltersEngine instance from binary form.
  console.time("deserialize engine");
  const engine = FiltersEngine.deserialize(new Uint8Array(serialized));
  console.timeEnd("deserialize engine");

  return engine;
}

(async () => {
  const engine = await loadAdblocker();
  const browser = await puppeteer.launch({
    headless: false,
    devtools: false
  });

  const page = await browser.newPage();
  await page.setRequestInterception(true);

  page.on("request", request => {
    const { redirect, match } = engine.match(
      Request.fromPuppeteerDetails(request)
    );

    if (redirect) {
      console.log("ABORT REDIRECT");
      // NOTE: here we could use `request.respond` instead but this would
      // require `engine.match` to return more details than just `redirect`
      // (which is a data:url). Instead we would need `contentType` and `body`.
      request.abort("blockedbyclient");
    } else if (match) {
      console.log("ABORT MATCH");
      request.abort("blockedbyclient");
    } else {
      request.continue();
    }
  });

  // NOTE: we could also perform cosmetic injection using `page.addScriptTag`
  // and `page.addStyleTag`. Ideally all of this could be hidden behind a
  // `PuppeteerEngine` abstraction (similar to `WebExtensionEngine`.)
  //
  // We could also perform the CSP headers injection using the `request.respond`
  // method, which allows to inject custom headers.

  await page.goto("https://www.mangareader.net/");
})();
