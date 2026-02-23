export class ErrNotFound extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ErrNotFound";
	}
}

export class ErrVMNotFound extends ErrNotFound {
	constructor(vmID: string) {
		super(`vm not found: ${vmID}`);
		this.name = "ErrVMNotFound";
	}
}

export class ErrAuthFailed extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ErrAuthFailed";
	}
}

export class ErrQuotaExceeded extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ErrQuotaExceeded";
	}
}

export class ErrProvisionFailed extends Error {
	constructor(message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = "ErrProvisionFailed";
	}
}

export class ErrTimeout extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ErrTimeout";
	}
}

export class ErrUnknownProvider extends Error {
	constructor(providerName: string) {
		super(`unknown provider: ${providerName}`);
		this.name = "ErrUnknownProvider";
	}
}
