import { App, Testing } from "cdktn";
import { beforeAll, describe, expect, it } from "vitest";
import { MyStack } from "../src/stacks/my-stack.js";

describe("MyStack", () => {
  let resources: Record<string, Record<string, Record<string, unknown>>>;
  let synthesized: string;
  // biome-ignore lint/suspicious/noTemplateCurlyInString: Terraform interpolation, not a JS template literal
  const functionSaRef = "${google_service_account.FunctionServiceAccount.email}";
  // biome-ignore lint/suspicious/noTemplateCurlyInString: Terraform interpolation, not a JS template literal
  const schedulerSaRef = "${google_service_account.SchedulerServiceAccount.email}";
  // biome-ignore lint/suspicious/noTemplateCurlyInString: Terraform interpolation, not a JS template literal
  const functionUriRef = "${google_cloudfunctions2_function.Function.service_config[0].uri}";

  beforeAll(() => {
    // The stack reads these at construction time and throws without them.
    process.env.GCP_PROJECT_ID = "test-project";
    process.env.GCP_REGION = "europe-west1";
    // `runValidations` makes synth fail on construct-level validation errors.
    synthesized = Testing.synth(new MyStack(new App(), "test"), true);
    resources = JSON.parse(synthesized).resource;
  });

  it("configures the Google provider and enables every API the function needs", () => {
    expect(Testing.toHaveProvider(synthesized, "google")).toBe(true);
    const services = Object.values(resources.google_project_service ?? {}).map((s) => s.service);
    expect(services.sort()).toEqual([
      "artifactregistry.googleapis.com",
      "cloudbuild.googleapis.com",
      "cloudfunctions.googleapis.com",
      "cloudscheduler.googleapis.com",
      "run.googleapis.com",
    ]);
  });

  it("uploads the function source under a content-addressed name", () => {
    const object = resources.google_storage_bucket_object?.FunctionSourceObject;

    expect(object?.name).toMatch(/^function-source-[0-9A-F]+\.zip$/i);
    expect(object?.source).toMatch(/^assets\/FunctionAsset\/.+\.zip$/);
  });

  it("builds a 2nd gen function on Node 24 from that source", () => {
    const fn = resources.google_cloudfunctions2_function?.Function as {
      location: string;
      build_config: { runtime: string; entry_point: string };
      service_config: { max_instance_count: number; service_account_email: string };
    };

    expect(fn.location).toBe("europe-west1");
    expect(fn.build_config.runtime).toBe("nodejs24");
    expect(fn.build_config.entry_point).toBe("handler");
    expect(fn.service_config.max_instance_count).toBe(1);
    expect(fn.service_config.service_account_email).toBe(functionSaRef);
  });

  it("lets only the scheduler account invoke the underlying Cloud Run service", () => {
    expect(
      Testing.toHaveResourceWithProperties(synthesized, "google_cloud_run_v2_service_iam_member", {
        role: "roles/run.invoker",
        member: `serviceAccount:${schedulerSaRef}`,
      }),
    ).toBe(true);
  });

  it("schedules a signed GET to the function every minute", () => {
    const job = resources.google_cloud_scheduler_job?.Scheduler as {
      schedule: string;
      time_zone: string;
      http_target: {
        http_method: string;
        uri: string;
        oidc_token: { service_account_email: string; audience: string };
      };
    };

    expect(job.schedule).toBe("* * * * *");
    expect(job.time_zone).toBe("Etc/UTC");
    expect(job.http_target.http_method).toBe("GET");
    expect(job.http_target.uri).toBe(functionUriRef);
    expect(job.http_target.oidc_token.service_account_email).toBe(schedulerSaRef);
    expect(job.http_target.oidc_token.audience).toBe(functionUriRef);
  });
});
