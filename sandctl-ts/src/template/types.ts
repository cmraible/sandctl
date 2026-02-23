export interface TemplateInitScript {
	name: string;
	normalized: string;
	script: string;
}

export interface TemplateStoreLike {
	getInitScript(name: string): Promise<TemplateInitScript>;
}
