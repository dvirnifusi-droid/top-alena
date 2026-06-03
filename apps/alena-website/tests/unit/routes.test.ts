import { describe, it, expect } from "vitest";
import { routes, landingSlugs } from "@/lib/routes";

describe("routes", () => {
  it("has ASCII primary routes (Hebrew via redirects)", () => {
    expect(routes.menu).toBe("/menu");
    expect(routes.events).toBe("/events");
    expect(routes.contact).toBe("/contact");
  });

  it("lists 7 SEO landing slugs in Hebrew (dynamic route handles encoding)", () => {
    expect(landingSlugs).toHaveLength(7);
    expect(landingSlugs).toContain("חמארה-בראשון-לציון");
    expect(landingSlugs).toContain("המבורגר-בראשון");
  });
});
