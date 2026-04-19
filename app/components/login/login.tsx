import { useState } from "react";
import { FaEye, FaEyeSlash } from "react-icons/fa6";
import { Link } from "react-router";
import Register from "./register";

function Login() {
    const [emailOrUser, setEmailOrUser] = useState("");
    const [password, setPassword] = useState("");
    const [emailError, setEmailError] = useState("");""
    const [passwordError, setPasswordError] = useState("");
    const [showPassword, setShowPassword] = useState(false);

    const validateEmailOrUsername = (value: string) => {
        if (!value.trim()) {
            return "Please enter a valid email or username.";
        }
        return "";
    };

    const validatePassword = (value: string) => {
        if (!value.trim()) {
            return "Please enter a valid password."; 
        }
        return "";
    }

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const error1 = validateEmailOrUsername(emailOrUser);
        const error2 = validatePassword(password);
        if (error1) {
            setEmailError(error1);
        }
        if (error2) {
            setPasswordError(error2);
        }
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-screen px-4 -translate-y-10">
            <img 
                src="/bullet-logo-full.png"
                alt="The full bullet website logo. It features the handwritten text 'bullet' in all lowercase with serifs, two stars, one underneath the letters and one to the top right."
                className="w-full sm:w-lg lg:w-lg mb-6 sm:mb-8"
            />
            <form className="w-full max-w-md space-y-4" onSubmit={handleSubmit} noValidate>
                
                <div className="relative">
                    <input 
                        id="email-or-username-input"
                        value={emailOrUser}
                        type="text"
                        onChange={(e) => {
                            setEmailOrUser(e.target.value);
                            if (emailError) setEmailError("");
                        }}
                        className={`block px-3.5 pb-2.5 pt-6 w-full text-sm text-black bg-neutral-secondary-medium appearance-none focus:outline-none focus:ring-0 peer bg-white rounded-2xl border-1 border-(--color-primary-grey) hover:border-(--color-primary-grey-dark) ${emailError ? 'border-red-500 focus:border-red-500' : 'focus:border-brand'}`}
                        placeholder=" "
                    />
                    <label 
                        htmlFor={"email-or-username-input"} 
                        className="absolute text-sm text-body duration-300 transform -translate-y-3 scale-75 top-4.5 z-10 origin-[0] start-3.5 peer-focus:text-fg-brand peer-placeholder-shown:scale-100 peer-placeholder-shown:translate-y-0 peer-focus:scale-75 peer-focus:-translate-y-3 rtl:peer-focus:translate-x-1/4 rtl:peer-focus:left-auto text-(--color-primary-grey)">
                            {"Email or username"}
                    </label>
                </div>
                {emailError && (
                    <div className="text-red-500 text-sm -mt-2">
                        {emailError}
                    </div>
                )}
                <div className="relative">
                    <input 
                        id="password-input"
                        value={password}
                        type={showPassword ? "text" : "password"}
                        onChange={(e) => {
                            setPassword(e.target.value);
                            if (passwordError) setPasswordError("");
                        }}
                        className={`block px-3.5 pb-2.5 pt-6 pr-10 w-full text-sm text-black bg-neutral-secondary-medium appearance-none focus:outline-none focus:ring-0 peer bg-white rounded-2xl border-1 border-(--color-primary-grey) hover:border-(--color-primary-grey-dark) ${passwordError ? 'border-red-500 focus:border-red-500' : 'focus:border-brand'}`}
                        placeholder=" "
                    />
                    <label 
                        htmlFor={"password-input"} 
                        className="absolute text-sm text-body duration-300 transform -translate-y-3 scale-75 top-4.5 z-10 origin-[0] start-3.5 peer-focus:text-fg-brand peer-placeholder-shown:scale-100 peer-placeholder-shown:translate-y-0 peer-focus:scale-75 peer-focus:-translate-y-3 rtl:peer-focus:translate-x-1/4 rtl:peer-focus:left-auto text-(--color-primary-grey)">
                            {"Password"}
                    </label>
                    <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 pr-1 py-2 text-(--color-primary-grey) hover:text-(--color-primary-grey-dark) cursor-pointer"
                    >
                        {showPassword ? <FaEyeSlash /> : <FaEye />}
                    </button>
                </div>
                {passwordError && (
                    <div className="text-red-500 text-sm -mt-2">
                        {passwordError}
                    </div>
                )}
                <input type="submit" value="Login" className="block bg-(--color-primary-blue) hover:bg-(--color-primary-blue-dark) text-white px-6 py-3 mt-6 rounded-2xl mx-auto w-full sm:w-auto cursor-pointer "/>
            </form>
            <div className="mt-6 text-(--color-primary-grey)">
                <Link to={"/register"}>
                    <div className="underline hover:text-(--color-primary-grey-dark)">New to Bullet? Create an account</div>
                </Link>
            </div>
        </div>
    );
}

export default Login;