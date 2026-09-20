// onnxruntime-node ships its own types in most installs; this keeps the
// build honest where the tarball arrives without them. The module is
// loaded lazily (take-matte.ts) and used through a small, explicit surface.
declare module "onnxruntime-node";
