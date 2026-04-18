import { useState } from "react";

function Login() {
    const [emailOrUser, setEmailOrUser] = useState("");
    const [password, setPassword] = useState("");

    return (
        <div className="flex flex-col items-center justify-center min-h-screen px-4 -translate-y-10">
            <img 
                src="public/bullet-logo-full.png"
                alt="The full bullet website logo. It features the handwritten text 'bullet' in all lowercase with serifs, two stars, one underneath the letters and one to the top right."
                className="w-full sm:w-lg lg:w-lg mb-8 sm:mb-10"
            />
            <form className="w-full max-w-md space-y-4">
                <div className="relative">
                    <input 
                        id="email-or-username-input"
                        value={emailOrUser}
                        type="text"
                        onChange={(e) => setEmailOrUser(e.target.value)}
                        className="block px-3.5 pb-2.5 pt-6 w-full text-sm text-heading bg-neutral-secondary-medium appearance-none focus:outline-none focus:ring-0 focus:border-brand peer bg-white rounded-2xl border-1"
                        placeholder=" "
                    />
                    <label 
                        htmlFor={"email-or-username-input"} 
                        className="absolute text-sm text-body duration-300 transform -translate-y-3 scale-75 top-4.5 z-10 origin-[0] start-3.5 peer-focus:text-fg-brand peer-placeholder-shown:scale-100 peer-placeholder-shown:translate-y-0 peer-focus:scale-75 peer-focus:-translate-y-3 rtl:peer-focus:translate-x-1/4 rtl:peer-focus:left-auto text-[#9FA5B4] ">
                            {"Email or username"}
                    </label>
                </div>
                <div className="relative">
                    <input 
                        id="password-input"
                        value={password}
                        type="text"
                        onChange={(e) => setPassword(e.target.value)}
                        className="block px-3.5 pb-2.5 pt-6 w-full text-sm text-heading bg-neutral-secondary-medium appearance-none focus:outline-none focus:ring-0 focus:border-brand peer bg-white rounded-2xl border-1"
                        placeholder=" "
                    />
                    <label 
                        htmlFor={"password-input"} 
                        className="absolute text-sm text-body duration-300 transform -translate-y-3 scale-75 top-4.5 z-10 origin-[0] start-3.5 peer-focus:text-fg-brand peer-placeholder-shown:scale-100 peer-placeholder-shown:translate-y-0 peer-focus:scale-75 peer-focus:-translate-y-3 rtl:peer-focus:translate-x-1/4 rtl:peer-focus:left-auto text-[#9FA5B4] ">
                            {"Password"}
                    </label>
                </div>
                <input type="submit" value="Login" className="block bg-(--color-blue-main) text-white px-6 py-3 mt-10 rounded-2xl mx-auto w-full sm:w-auto cursor-pointer"/>
            </form>
        </div>
    );
}

export default Login;