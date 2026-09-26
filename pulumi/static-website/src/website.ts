import { fileURLToPath } from "node:url";
import * as gcp from "@pulumi/gcp";
import * as pulumi from "@pulumi/pulumi";

const indexHtml = fileURLToPath(new URL("../public/index.html", import.meta.url));

export function createWebsite() {
  const bucket = new gcp.storage.Bucket("website-bucket", {
    location: "EU",
    website: { mainPageSuffix: "index.html" },
    uniformBucketLevelAccess: true,
    forceDestroy: true,
  });

  // Public read on every object: this bucket serves a website.
  new gcp.storage.BucketIAMBinding("website-bucket-iam-binding", {
    bucket: bucket.name,
    role: "roles/storage.objectViewer",
    members: ["allUsers"],
  });

  const indexPage = new gcp.storage.BucketObject("website-index-page", {
    bucket: bucket.name,
    name: "index.html",
    source: new pulumi.asset.FileAsset(indexHtml),
    contentType: "text/html",
  });

  return {
    bucket,
    indexPage,
    url: pulumi.interpolate`https://storage.googleapis.com/${bucket.name}/${indexPage.outputName}`,
  };
}
