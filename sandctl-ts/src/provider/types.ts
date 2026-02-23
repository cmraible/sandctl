export type VMStatus =
	| "provisioning"
	| "starting"
	| "running"
	| "stopping"
	| "stopped"
	| "deleting"
	| "failed";

interface VMBase {
	id: string;
	name: string;
	region: string;
	serverType: string;
	createdAt: string;
}

type VMProvisioningStatus = "provisioning" | "starting";
type VMNonProvisioningStatus = Exclude<VMStatus, VMProvisioningStatus>;

export type VM =
	| (VMBase & {
			status: VMProvisioningStatus;
			ipAddress?: string | null;
	  })
	| (VMBase & {
			status: VMNonProvisioningStatus;
			ipAddress: string | null;
	  });

export interface CreateOpts {
	name: string;
	region?: string;
	serverType?: string;
	image?: string;
	sshKeyIDs?: string[];
	userData?: string;
}
