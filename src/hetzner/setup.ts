export {
	assembleUserData,
	detectContentType,
	generateCloudInit,
	generatePostSnapshotSSHSetup,
} from "@/provider/cloud-init";

export const DEFAULT_REGION = "ash";
export const DEFAULT_SERVER_TYPE = "cpx31";
export const DEFAULT_IMAGE = "ubuntu-24.04";
