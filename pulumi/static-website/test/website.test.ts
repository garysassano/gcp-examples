import * as pulumi from "@pulumi/pulumi";
import { beforeAll, describe, expect, it } from "vitest";

type Created = { type: string; name: string; inputs: Record<string, unknown> };
const created: Created[] = [];

function resolve<T>(output: pulumi.Output<T>): Promise<T> {
  return new Promise((done) => output.apply(done));
}

describe("createWebsite", () => {
  let website: Awaited<ReturnType<typeof import("../src/website.js").createWebsite>>;

  beforeAll(async () => {
    // Mocks must be in place before the program constructs any resource.
    await pulumi.runtime.setMocks(
      {
        newResource: ({ type, name, inputs }) => {
          created.push({ type, name, inputs });
          // Like the provider: a bucket without an explicit name is named after
          // the resource, and an object reports its name back as outputName.
          const state = { ...inputs, name: inputs.name ?? name, outputName: inputs.name };
          return { id: `${name}-id`, state };
        },
        call: ({ inputs }) => inputs,
      },
      "pulumi-static-website",
      "test",
    );
    const { createWebsite } = await import("../src/website.js");
    website = createWebsite();
    await resolve(website.url);
  });

  const byType = (type: string) => created.filter((r) => r.type === type);

  it("creates a uniform-access website bucket in the EU", () => {
    const [bucket] = byType("gcp:storage/bucket:Bucket");
    expect(bucket?.inputs).toMatchObject({
      location: "EU",
      uniformBucketLevelAccess: true,
      website: { mainPageSuffix: "index.html" },
    });
  });

  it("makes the bucket's objects publicly readable", () => {
    const [binding] = byType("gcp:storage/bucketIAMBinding:BucketIAMBinding");
    expect(binding?.inputs).toMatchObject({
      role: "roles/storage.objectViewer",
      members: ["allUsers"],
    });
  });

  it("uploads index.html as HTML", () => {
    const [page] = byType("gcp:storage/bucketObject:BucketObject");
    expect(page?.inputs).toMatchObject({ name: "index.html", contentType: "text/html" });
  });

  it("exports the page's public HTTPS URL", async () => {
    await expect(resolve(website.url)).resolves.toBe(
      "https://storage.googleapis.com/website-bucket/index.html",
    );
  });
});
