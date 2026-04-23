import { Link } from "react-router";


function Landing() {
    return (
        <div className="flex flex-row items-center justify-center min-h-screen w-full gap-10">
            <div className="">
                <img 
                src="/bullet-logo-full.png"
                alt="The full bullet website logo. It features the handwritten text 'bullet' in all lowercase with serifs, two stars, one underneath the letters and one to the top right."
                className="w-full sm:w-lg lg:w-lg"
                />
            </div>
            <div className="flex flex-col max-w-[30vw] text-center gap-5">
                <h1 className="font-bold text-5xl ">Your very own digital bulletin board.</h1>
                <h2>Create a highly customizable productivity hub with a to-do list, time tracking, calendar, and more, all at your fingertips.</h2>
                <div className="flex flex-row items-center justify-center mt-2">
                    <button className="block bg-(--color-primary-blue) hover:bg-(--color-primary-blue-dark) text-white px-6 py-3 rounded-2xl w-full sm:w-auto cursor-pointer mx-2">
                        <Link to={"register"}>Get Started</Link>
                    </button>
                    {/* <button className="block bg-(--color-primary-blue) hover:bg-(--color-primary-blue-dark) text-white px-6 py-3 rounded-2xl w-full sm:w-auto cursor-pointer mx-2">
                        <Link to={"login"}>Login</Link>
                    </button> */}
                </div>
            </div>
        </div>
    );
}

export default Landing;