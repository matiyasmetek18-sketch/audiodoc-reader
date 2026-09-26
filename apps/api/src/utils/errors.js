export function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

export function notFound(message = "Not found") {
  const err = new Error(message);
  err.status = 404;
  return err;
}
