import { groq } from "next-sanity";

export const siteSettingsQuery = groq`*[_type == "siteSettings"][0]`;

export const hoursQuery = groq`*[_type == "hours"] | order(day asc)`;

export const menuQuery = groq`{
  "categories": *[_type == "menuCategory"] | order(order asc),
  "items": *[_type == "menuItem" && available == true]{
    _id, name, description, price, image, tags,
    "category": category->{_id, name, slug}
  }
}`;

export const eventPackagesQuery = groq`*[_type == "eventPackage"] | order(minGuests asc)`;

export const reviewsQuery = groq`*[_type == "review"] | order(date desc)[0...10]`;

export const blogIndexQuery = groq`*[_type == "blogPost" && defined(publishedAt)] | order(publishedAt desc){
  _id, title, slug, heroImage, excerpt, publishedAt
}`;

export const blogPostQuery = groq`*[_type == "blogPost" && slug.current == $slug][0]`;

export const landingBySlugQuery = groq`*[_type == "landingPage" && slug.current == $slug][0]{
  ..., relatedMenuItems[]->, reviews[]->
}`;

export const allLandingSlugsQuery = groq`*[_type == "landingPage"].slug.current`;

export const activeBannerQuery = groq`*[_type == "banner" && active == true] | order(priority desc)[0]`;

export const galleryQuery = groq`*[_type == "galleryImage"] | order(order asc, _createdAt desc){
  _id, image, alt, category, instagramUrl, featured
}`;

export const featuredGalleryQuery = groq`*[_type == "galleryImage" && featured == true] | order(order asc)[0...12]{
  _id, image, alt, instagramUrl
}`;
