import type { Route } from "./+types/home";
import { Login } from "~/components/login/login";
import { Welcome } from "../welcome/welcome";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "bullet" },
    { name: "description", content: "An app to help you focus on now." },
  ];
}

export default function Home() {
  return <Login />;
}
