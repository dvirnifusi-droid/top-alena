import { defineType, defineField } from "sanity";

// Singleton — one document controls every "photo slot" on the site.
// Each field is optional; when empty, the code falls back to the hardcoded default.
// The owner opens Studio → "תמונות באתר" → uploads a new image → site refreshes.

const slot = (name: string, title: string, description?: string) =>
  defineField({ name, title, type: "image", options: { hotspot: true }, description });

export default defineType({
  name: "sitePhotos",
  title: "תמונות באתר",
  type: "document",
  // Grouping helps the owner navigate a long list of slots.
  groups: [
    { name: "home", title: "עמוד הבית" },
    { name: "events", title: "אירועים" },
    { name: "about", title: "אודות" },
    { name: "menu", title: "תפריט" },
    { name: "gift", title: "שובר מתנה" },
    { name: "delivery", title: "משלוחים" },
    { name: "reserve", title: "הזמן שולחן" },
  ],
  fields: [
    // ===== Home =====
    { ...slot("homeHeroBg", "בית · רקע Hero (מנת חתימה / אווירה)", "התמונה שברקע של כרטיס הכניסה בעמוד הבית"), group: "home" },
    { ...slot("homeStoryImage", "בית · תמונת ה-Story"), group: "home" },
    { ...slot("homeChefImage", "בית · תמונת השף"), group: "home" },
    { ...slot("homeMenuTeaserImage", "בית · תמונה בכרטיס תפריט"), group: "home" },
    { ...slot("homeEventsTeaserImage", "בית · תמונה בכרטיס אירועים"), group: "home" },
    { ...slot("homeGiftBandImage", "בית · תמונה בפס שובר מתנה"), group: "home" },

    // ===== Events =====
    { ...slot("eventsHeroImage", "אירועים · רקע Hero"), group: "events" },
    { ...slot("eventsAgentImage", "אירועים · תמונה בכרטיס סוכן AI (במקום זוג האורחים)", "התמונה שמופיעה בצד ימין של כרטיס סוכן ה-AI"), group: "events" },
    { ...slot("eventsGallery1", "אירועים · גלריית תחתית — תמונה 1"), group: "events" },
    { ...slot("eventsGallery2", "אירועים · גלריית תחתית — תמונה 2"), group: "events" },
    { ...slot("eventsGallery3", "אירועים · גלריית תחתית — תמונה 3"), group: "events" },

    // ===== About =====
    { ...slot("aboutHeroImage", "אודות · תמונת Hero"), group: "about" },
    { ...slot("aboutStoryImage", "אודות · תמונת סיפור המקום"), group: "about" },

    // ===== Menu =====
    { ...slot("menuHeroImage", "תפריט · תמונת Hero"), group: "menu" },
    { ...slot("menuFeatureImage", "תפריט · תמונה מרכזית"), group: "menu" },

    // ===== Gift =====
    { ...slot("giftHeroImage", "שובר מתנה · תמונת Hero"), group: "gift" },

    // ===== Delivery =====
    { ...slot("deliveryHeroImage", "משלוחים · תמונת Hero"), group: "delivery" },

    // ===== Reserve =====
    { ...slot("reserveHeroImage", "הזמן שולחן · תמונת Hero"), group: "reserve" },
  ],
  preview: {
    prepare: () => ({ title: "תמונות באתר" }),
  },
});
