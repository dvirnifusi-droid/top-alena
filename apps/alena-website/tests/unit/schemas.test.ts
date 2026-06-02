import { describe, it, expect } from "vitest";
import { restaurantSchema, faqSchema, breadcrumbSchema } from "@/components/seo/schemas";

describe("schemas", () => {
  it("builds Restaurant LD with required fields", () => {
    const s = restaurantSchema({
      name: "עלינא",
      phone: "03-622-8055",
      address: "רוטשילד 104, ראשון לציון",
      url: "https://example.com",
    });
    expect(s["@type"]).toBe("Restaurant");
    expect(s.telephone).toBe("03-622-8055");
    expect(s.address.streetAddress).toBe("רוטשילד 104, ראשון לציון");
  });

  it("builds FAQ LD from Q/A pairs", () => {
    const s = faqSchema([{ q: "?", a: "!" }]);
    expect(s.mainEntity).toHaveLength(1);
  });

  it("builds Breadcrumb LD with positions", () => {
    const s = breadcrumbSchema([
      { name: "בית", url: "/" },
      { name: "תפריט", url: "/תפריט" },
    ]);
    expect(s.itemListElement[1].position).toBe(2);
  });
});
