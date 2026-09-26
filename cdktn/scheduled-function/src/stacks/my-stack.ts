import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { AssetType, TerraformAsset, TerraformStack } from "cdktn";
import type { Construct } from "constructs";
import { CloudRunV2ServiceIamMember } from "../../.gen/providers/google/cloud-run-v2-service-iam-member/index.js";
import { CloudSchedulerJob } from "../../.gen/providers/google/cloud-scheduler-job/index.js";
import { Cloudfunctions2Function } from "../../.gen/providers/google/cloudfunctions2-function/index.js";
import { ProjectService } from "../../.gen/providers/google/project-service/index.js";
import { GoogleProvider } from "../../.gen/providers/google/provider/index.js";
import { ServiceAccount } from "../../.gen/providers/google/service-account/index.js";
import { StorageBucket } from "../../.gen/providers/google/storage-bucket/index.js";
import { StorageBucketObject } from "../../.gen/providers/google/storage-bucket-object/index.js";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

// Cloud Functions (2nd gen) builds with Cloud Build, stores the image in
// Artifact Registry, and runs it on Cloud Run.
const requiredApis = [
  "artifactregistry.googleapis.com",
  "cloudbuild.googleapis.com",
  "cloudfunctions.googleapis.com",
  "cloudscheduler.googleapis.com",
  "run.googleapis.com",
];

export class MyStack extends TerraformStack {
  constructor(scope: Construct, id: string) {
    super(scope, id);

    const uniqueId = this.node.addr.substring(0, 8);

    // Read GCP_PROJECT_ID and GCP_REGION from environment variables
    const gcpProjectId = process.env.GCP_PROJECT_ID;
    const gcpRegion = process.env.GCP_REGION;
    if (!gcpProjectId || !gcpRegion) {
      throw new Error(
        "Required environment variables 'GCP_PROJECT_ID' or 'GCP_REGION' are missing or undefined",
      );
    }

    new GoogleProvider(this, "GcpProvider", {
      project: gcpProjectId,
      region: gcpRegion,
    });

    const apis = requiredApis.map(
      (service) =>
        new ProjectService(this, `Api-${service.split(".")[0]}`, {
          service,
          disableOnDestroy: false,
        }),
    );

    //==============================================================================
    // Function source
    //==============================================================================

    const functionAsset = new TerraformAsset(this, "FunctionAsset", {
      path: join(projectRoot, "src", "function"),
      type: AssetType.ARCHIVE,
    });

    const sourceBucket = new StorageBucket(this, "FunctionSourceBucket", {
      name: `scheduled-function-source-${uniqueId}`,
      location: gcpRegion,
      uniformBucketLevelAccess: true,
      forceDestroy: true,
    });

    // Naming the object after the source hash makes a code change a new
    // object, which is what makes Terraform rebuild the function.
    const sourceObject = new StorageBucketObject(this, "FunctionSourceObject", {
      name: `function-source-${functionAsset.assetHash}.zip`,
      bucket: sourceBucket.name,
      source: functionAsset.path,
    });

    //==============================================================================
    // Function
    //==============================================================================

    const functionServiceAccount = new ServiceAccount(this, "FunctionServiceAccount", {
      accountId: `scheduled-function-${uniqueId}`,
      displayName: `Runtime identity for scheduled-function-${uniqueId}`,
    });

    const fn = new Cloudfunctions2Function(this, "Function", {
      name: `scheduled-function-${uniqueId}`,
      location: gcpRegion,
      buildConfig: {
        runtime: "nodejs24",
        entryPoint: "handler",
        source: {
          storageSource: {
            bucket: sourceBucket.name,
            object: sourceObject.name,
          },
        },
      },
      serviceConfig: {
        maxInstanceCount: 1,
        availableMemory: "256M",
        timeoutSeconds: 60,
        serviceAccountEmail: functionServiceAccount.email,
      },
      dependsOn: apis,
    });

    //==============================================================================
    // Schedule
    //==============================================================================

    const schedulerServiceAccount = new ServiceAccount(this, "SchedulerServiceAccount", {
      accountId: `scheduler-${uniqueId}`,
      displayName: `Invoker identity for scheduler-${uniqueId}`,
    });

    // A 2nd gen function is a Cloud Run service, so invoking it takes
    // run.invoker on that service rather than a Cloud Functions role.
    new CloudRunV2ServiceIamMember(this, "SchedulerInvoker", {
      location: gcpRegion,
      name: fn.serviceConfig.service,
      role: "roles/run.invoker",
      member: `serviceAccount:${schedulerServiceAccount.email}`,
    });

    new CloudSchedulerJob(this, "Scheduler", {
      name: `scheduler-${uniqueId}`,
      region: gcpRegion,
      description: `Trigger ${fn.name} every minute`,
      schedule: "* * * * *",
      timeZone: "Etc/UTC",
      attemptDeadline: "60s",
      httpTarget: {
        httpMethod: "GET",
        uri: fn.serviceConfig.uri,
        oidcToken: {
          serviceAccountEmail: schedulerServiceAccount.email,
          audience: fn.serviceConfig.uri,
        },
      },
      dependsOn: apis,
    });
  }
}
