import type { Route } from "./+types/home";
import Landing from "~/components/auth/landing";

export function meta({}: Route.MetaArgs) {
    return [
        { title: "bullet" },
        {
            name: "description",
            content: "Your very own digital bulletin board.",
        },
    ];
}

export default function Home() {
    return <Landing />;
}
