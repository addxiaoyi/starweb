export function browserRecovery(_request, response) {
  response
    .set('Clear-Site-Data', '"cache", "storage"')
    .set('Cache-Control', 'no-store')
    .status(204)
    .end()
}
