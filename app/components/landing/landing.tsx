import { Link } from "react-router";


function Landing() {
    return (
        <div className="flex lg:flex-row flex-col items-center justify-center min-h-screen w-full gap-10 px-5">
            <div className="">
                <img 
                src="/bullet-logo-full.png"
                alt="The full bullet website logo. It features the handwritten text 'bullet' in all lowercase with serifs, two stars, one underneath the letters and one to the top right."
                className="w-full lg:w-lg md:max-w-[50vw] sm:max-w-[75vw]"
                />
            </div>
            <div className="flex flex-col lg:max-w-[30vw] md:max-w-[50vw] sm:max-w-[75vw] max-w-screen text-center gap-5">
                <h1 className="font-bold sm:text-5xl text-4xl">Your very own digital bulletin board.</h1>
                <h2 className="sm:text-base text-sm">Create a highly customizable productivity hub with a to-do list, time tracking, calendar, and more, all at your fingertips.</h2>
                <div className="flex flex-row items-center justify-center mt-2">
                    <button className="block bg-(--color-primary-blue) hover:bg-(--color-primary-blue-dark) text-white px-6 py-3 rounded-2xl w-auto cursor-pointer mx-2 sm:text-base text-sm">
                        <Link to={"register"}>Get Started</Link>
                    </button>
                </div>
            </div>
        </div>
    );
}

export default Landing;