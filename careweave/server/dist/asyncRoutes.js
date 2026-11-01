// Express 4 does not catch a rejected async handler: one bad request body would crash the whole process.
// Wrapping every route handler once makes a throw reach the error middleware instead.
export function catchAsyncRoutes(app) {
    for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
        const register = app[method].bind(app);
        app[method] = (path, ...handlers) => handlers.length === 0
            ? register(path)
            : register(path, ...handlers.map((h) => (typeof h === 'function' && h.length < 4
                ? (req, res, next) => Promise.resolve(h(req, res, next)).catch(next)
                : h)));
    }
}
