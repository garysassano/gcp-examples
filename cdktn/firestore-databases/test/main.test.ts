import { App, Testing } from "cdktn";
import { beforeAll, describe, expect, it } from "vitest";
import { MyStack } from "../src/stacks/my-stack.js";

describe("MyStack", () => {
  let synthesized: string;

  beforeAll(() => {
    // The stack reads these at construction time and throws without them.
    process.env.GCP_PROJECT_ID = "test-project";
    process.env.GCP_REGION = "europe-west1";
    // `runValidations` makes synth fail on construct-level validation errors.
    synthesized = Testing.synth(new MyStack(new App(), "test"), true);
  });

  it("configures the Google provider from the environment", () => {
    expect(Testing.toHaveProvider(synthesized, "google")).toBe(true);
    expect(JSON.parse(synthesized).provider.google[0]).toMatchObject({
      project: "test-project",
      region: "europe-west1",
    });
  });

  it("enables the Firestore API and disables it on destroy", () => {
    expect(
      Testing.toHaveResourceWithProperties(synthesized, "google_project_service", {
        service: "firestore.googleapis.com",
        disable_on_destroy: true,
      }),
    ).toBe(true);
  });

  it("creates one Datastore-mode and one Native-mode database in the region", () => {
    for (const [name, type] of [
      ["datastore-mode-db", "DATASTORE_MODE"],
      ["firestore-mode-db", "FIRESTORE_NATIVE"],
    ]) {
      expect(
        Testing.toHaveResourceWithProperties(synthesized, "google_firestore_database", {
          name,
          type,
          location_id: "europe-west1",
          concurrency_mode: "OPTIMISTIC",
          deletion_policy: "DELETE",
        }),
      ).toBe(true);
    }
  });

  it("nests the three documents through their parent paths", () => {
    const docs = JSON.parse(synthesized).resource.google_firestore_document;

    // biome-ignore lint/suspicious/noTemplateCurlyInString: Terraform interpolation, not a JS template literal
    const subPath = "${google_firestore_document.Document.path}/sub-collection";
    // biome-ignore lint/suspicious/noTemplateCurlyInString: Terraform interpolation, not a JS template literal
    const subSubPath = "${google_firestore_document.SubDocument.path}/sub-sub-collection";

    expect(docs.Document.collection).toBe("collection");
    expect(docs.SubDocument.collection).toBe(subPath);
    expect(docs.SubSubDocument.collection).toBe(subSubPath);
  });
});
