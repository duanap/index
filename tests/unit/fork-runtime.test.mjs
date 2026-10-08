import { test } from "node:test";
import assert from "node:assert/strict";
import { settingsUpdateBody } from "emdash/api/schemas";
import { pluginResponse } from "emdash";
import { globSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

test("site settings preserve carousel and registration links instead of silently stripping them", () => {
  const input = {
    footerLinks: [{ label: "备案", url: "https://beian.miit.gov.cn/" }],
    heroSlides: [
      {
        title: "测试轮播",
        imageUrl: "/_emdash/api/media/file/test-original.png",
        url: "/posts/",
      },
    ],
    heroCarousel: {
      intervalSeconds: 7,
      blurPx: 0,
      overlayOpacity: 35,
      textPosition: "center",
    },
  };
  const parsed = settingsUpdateBody.parse(input);
  assert.deepEqual(parsed.footerLinks, input.footerLinks);
  assert.deepEqual(parsed.heroSlides, input.heroSlides);
  assert.equal(parsed.heroCarousel.intervalSeconds, 7);
});

test("trusted raw login responses retain two distinct cookies while sandboxed responses cannot set cookies", async () => {
  const path = [...globSync("node_modules/emdash/dist/route-wire-*.mjs")][0];
  const module = await import(pathToFileURL(resolve(path)).href);
  const toWire = Object.values(module).find(
    (value) =>
      typeof value === "function" && value.name === "pluginRouteResponseToWire",
  );
  assert.equal(typeof toWire, "function");
  const cookies = [
    "dm_session=abc; Path=/; HttpOnly; Secure; SameSite=Lax",
    "dm_state=; Path=/; Max-Age=0; Secure; SameSite=Lax",
  ];
  const response = pluginResponse({
    status: 302,
    headers: [
      ["location", "/member/"],
      ...cookies.map((cookie) => ["set-cookie", cookie]),
    ],
    body: null,
  });
  const trusted = await toWire(response, {
    allowSetCookie: true,
    publicRequestUrl: "https://duanap.cn/",
  });
  assert.deepEqual(
    trusted.headers
      .filter(([name]) => name === "set-cookie")
      .map(([, value]) => value),
    cookies,
  );
  const sandboxed = await toWire(response, {
    publicRequestUrl: "https://duanap.cn/",
  });
  assert.equal(
    sandboxed.headers.some(([name]) => name === "set-cookie"),
    false,
  );
});
