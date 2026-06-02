import createImageUrlBuilder from "@sanity/image-url";
import { env } from "../../src/lib/env";

const builder = createImageUrlBuilder({
  projectId: env.NEXT_PUBLIC_SANITY_PROJECT_ID,
  dataset: env.NEXT_PUBLIC_SANITY_DATASET,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const urlFor = (src: unknown) => builder.image(src as any);
