import { type RouteConfig, index, layout, route } from "@react-router/dev/routes";

export default [
    index("routes/home.tsx"),
    route("login", "routes/auth/login.tsx"),
    route("register", "routes/auth/register.tsx"),

    layout("./app/layouts/auth.tsx", [
        route("in", "routes/bulletin.tsx"),
    ]),
] satisfies RouteConfig;
