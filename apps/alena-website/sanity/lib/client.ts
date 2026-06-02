import { createClient } from "next-sanity";
import { env } from "../../src/lib/env";

export const sanity = createClient({
  projectId: env.NEXT_PUBLIC_SANITY_PROJECT_ID,
  dataset: env.NEXT_PUBLIC_SANITY_DATASET,
  apiVersion: "2024-01-01",
  useCdn: true,
  token: env.SANITY_API_READ_TOKEN,
});
