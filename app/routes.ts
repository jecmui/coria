import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
    index("routes/home.tsx"),
    route("login", "components/landing/login.tsx"),
    route("register", "components/landing/register.tsx"),
] satisfies RouteConfig;
