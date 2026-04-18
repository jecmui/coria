import { createBrowserRouter } from "react-router";
import Register from "./components/login/register";
import Login from "./components/login/login";
import Home from "./routes/home";

const router = createBrowserRouter([
    {
        path: "/",
        Component: Home,
        children: [
            { index: true, Component: Login },
            { path: "register", Component: Register },
        ]
    },
]);

export default router;
