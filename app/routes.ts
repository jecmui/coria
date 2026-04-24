import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
    index("routes/home.tsx"),
    route("login", "components/auth/login.tsx"),
    route("register", "components/auth/register.tsx"),
] satisfies RouteConfig;
