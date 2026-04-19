import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
    index("routes/home.tsx"),
    route("login", "components/login/login.tsx"),
    route("register", "components/login/register.tsx"),
] satisfies RouteConfig;
