import { TerraformStack } from "cdktn";
import type { Construct } from "constructs";
import { FirestoreDatabase } from "../../.gen/providers/google/firestore-database/index.js";
import { FirestoreDocument } from "../../.gen/providers/google/firestore-document/index.js";
import { ProjectService } from "../../.gen/providers/google/project-service/index.js";
import { GoogleProvider } from "../../.gen/providers/google/provider/index.js";

export class MyStack extends TerraformStack {
  constructor(scope: Construct, id: string) {
    super(scope, id);

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

    const cloudFirestoreApi = new ProjectService(this, "CloudFirestoreAPI", {
      service: "firestore.googleapis.com",
      disableOnDestroy: true,
    });

    new FirestoreDatabase(this, "DatastoreModeDB", {
      name: "datastore-mode-db",
      locationId: gcpRegion,
      type: "DATASTORE_MODE",
      concurrencyMode: "OPTIMISTIC",
      appEngineIntegrationMode: "DISABLED",
      pointInTimeRecoveryEnablement: "POINT_IN_TIME_RECOVERY_DISABLED",
      deleteProtectionState: "DELETE_PROTECTION_DISABLED",
      deletionPolicy: "DELETE",
      dependsOn: [cloudFirestoreApi],
    });

    const nativeModeDb = new FirestoreDatabase(this, "NativeModeDB", {
      name: "firestore-mode-db",
      locationId: gcpRegion,
      type: "FIRESTORE_NATIVE",
      concurrencyMode: "OPTIMISTIC",
      appEngineIntegrationMode: "DISABLED",
      pointInTimeRecoveryEnablement: "POINT_IN_TIME_RECOVERY_DISABLED",
      deleteProtectionState: "DELETE_PROTECTION_DISABLED",
      deletionPolicy: "DELETE",
      dependsOn: [cloudFirestoreApi],
    });

    const document = new FirestoreDocument(this, "Document", {
      database: nativeModeDb.name,
      documentId: "document",
      collection: "collection",
      fields: JSON.stringify({ "key-1": { stringValue: "value-1" } }),
      dependsOn: [cloudFirestoreApi],
    });

    const subDocument = new FirestoreDocument(this, "SubDocument", {
      database: nativeModeDb.name,
      documentId: "sub-document",
      collection: `${document.path}/sub-collection`,
      fields: JSON.stringify({ "key-2": { stringValue: "value-2" } }),
      dependsOn: [cloudFirestoreApi],
    });

    new FirestoreDocument(this, "SubSubDocument", {
      database: nativeModeDb.name,
      documentId: "sub-sub-document",
      collection: `${subDocument.path}/sub-sub-collection`,
      fields: JSON.stringify({ "key-3": { stringValue: "value-3" } }),
      dependsOn: [cloudFirestoreApi],
    });
  }
}
