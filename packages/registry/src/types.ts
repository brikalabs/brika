/** Verified plugin entry from the registry. */
export interface VerifiedPlugin {
	name: string;
	verifiedAt: string;
	verifiedBy: string;
	description?: string;
	tags?: string[];
	minVersion?: string;
	featured?: boolean;
	category?: string;
	/** Where the package is hosted (npm, github, url) */
	source?: string;
	/** Hex-encoded Ed25519 signature of this plugin entry */
	signature?: string;
}

/** Verified plugins list from the registry. */
export interface VerifiedPluginsList {
	plugins: VerifiedPlugin[];
	version: string;
	lastUpdated: string;
	/** Base64-encoded raw Ed25519 public key (32 bytes) */
	publicKey?: string;
	/** Hex-encoded Ed25519 signature of the registry */
	signature?: string;
}
