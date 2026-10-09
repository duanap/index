import { test } from "node:test";
import assert from "node:assert/strict";

test("hero slides and footer links reject dangerous stored values and keep WebP origins", async () => {
  const { heroSlides, footerLinks } =
    await import("../../src/lib/settings-content").catch(
      () => ({}) as Record<string, unknown>,
    );
  assert.equal(typeof heroSlides, "function");
  assert.equal(typeof footerLinks, "function");
  const values = {
    heroSlides: [
      {
        title: "好图",
        imageUrl: "/_emdash/api/media/file/a.png",
        url: "/posts/",
      },
      {
        title: "坏链接",
        imageUrl: "https://images.test/a.png",
        url: "javascript:alert(1)",
      },
      { title: "坏图片", imageUrl: "data:image/svg+xml,x", url: "/" },
      {
        title: "凭据",
        imageUrl: "https://user:secret@images.test/a.png",
        url: "/",
      },
    ],
  };
  assert.deepEqual((heroSlides as Function)(values), [
    {
      title: "好图",
      imageUrl: "/_emdash/api/media/file/a.png?format=webp",
      url: "/posts/",
      excerpt: "",
    },
  ]);
  assert.equal(
    (heroSlides as Function)({
      heroSlides: Array.from({ length: 20 }, (_, i) => ({
        title: String(i),
        imageUrl: "https://images.test/a.png",
        url: "/",
      })),
    }).length,
    8,
  );
  assert.deepEqual(
    (footerLinks as Function)({
      footerLinks: [
        { label: "虚假", url: "javascript:x" },
        {
          label: "备案",
          url: "https://beian.miit.gov.cn/",
          iconUrl: "//evil.test/",
        },
      ],
    }),
    [{ label: "备案", url: "https://beian.miit.gov.cn/", iconUrl: undefined }],
  );
});
