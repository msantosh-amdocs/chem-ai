/**
 * Sandbox layer: pure presentational UI primitives.
 *
 * Rules:
 * - No imports from `business/` or `connector/`.
 * - No domain types (only generic props: strings, numbers, files, callbacks).
 * - No network / storage / global state.
 */
export { Avatar, type AvatarProps, type AvatarSize } from "./Avatar";
export { Markdown } from "./Markdown";
export { DocumentDropzone, type DocumentDropzoneProps } from "./DocumentDropzone";
export { CompletenessDial } from "./CompletenessDial";
export { Spinner } from "./Spinner";
export { StatusPill, type PillStatus } from "./StatusPill";
