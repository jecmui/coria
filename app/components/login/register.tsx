import { useState } from "react";
import { Link } from "react-router";
import { FaEye, FaEyeSlash } from "react-icons/fa6";

function Register() {
    const [email, setEmail] = useState("");
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [password2, setPassword2] = useState("");
    const [emailError, setEmailError] = useState("");
    const [usernameError, setUsernameError] = useState("");
    const [passwordError, setPasswordError] = useState("");
    const [showPassword, setShowPassword] = useState(false);

    // Password requirement checks
    const hasMinLength = password.length >= 8;
    const hasSpecialChar = /[!@#$%^&*]/.test(password);
    const hasUppercase = /[A-Z]/.test(password);
    const hasLowercase = /[a-z]/.test(password);
    const hasNumber = /[0-9]/.test(password);

    const validateEmail = (value: string) => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!value.trim() || value.indexOf(' ') >= 0 || !emailRegex.test(value)) {
            return "Please enter a valid email address.";
        } 
    }

    const validateUsername = (value: string) => {
        if (!value.trim()) {
            return "Please enter a valid username.";
        } else if (value.indexOf(' ') >= 0) {
            return "Usernames cannot have spaces.";
        }
    }

    const validatePassword = (value: string, value1: string) => {
        if (!value.trim()) {
            return "Please enter a valid password."; 
        } else if (value != value1) {
            return "Passwords do not match."
        }
        return "";
    }

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const error1 = validateEmail(email);
        const error2 = validateUsername(username);
        const error3 = validatePassword(password, password2);
        if (error1) {
            setEmailError(error1);
        }
        if (error2) {
            setUsernameError(error2);
        }
        if (error3) {
            setPasswordError(error3);
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
                {/* Email input */}
                <div className="relative">
                    <input 
                        id="email-input"
                        value={email}
                        type="email"
                        onChange={(e) => {
                            setEmail(e.target.value);
                            if (emailError) setEmailError("");
                        }}
                        className={`block px-3.5 pb-2.5 pt-6 w-full text-sm text-black bg-neutral-secondary-medium appearance-none focus:outline-none focus:ring-0 peer bg-white rounded-2xl border-1 border-(--color-primary-grey) hover:border-(--color-primary-grey-dark) ${emailError ? 'border-red-500 focus:border-red-500' : 'focus:border-brand'}`}
                        placeholder=" "
                    />
                    <label 
                        htmlFor={"email-input"} 
                        className="absolute text-sm text-body duration-300 transform -translate-y-3 scale-75 top-4.5 z-10 origin-[0] start-3.5 peer-focus:text-fg-brand peer-placeholder-shown:scale-100 peer-placeholder-shown:translate-y-0 peer-focus:scale-75 peer-focus:-translate-y-3 rtl:peer-focus:translate-x-1/4 rtl:peer-focus:left-auto text-(--color-primary-grey)">
                            {"Email address"}
                    </label>
                </div>
                {emailError && (
                    <div className="text-red-500 text-xs -mt-2">
                        {emailError}
                    </div>
                )}
                {/* Username input */}
                <div className="relative">
                    <input 
                        id="username-input"
                        value={username}
                        type="text"
                        onChange={(e) => {
                            setUsername(e.target.value);
                            if (usernameError) setUsernameError("");
                        }}
                        className={`block px-3.5 pb-2.5 pt-6 w-full text-sm text-black bg-neutral-secondary-medium appearance-none focus:outline-none focus:ring-0 peer bg-white rounded-2xl border-1 border-(--color-primary-grey) hover:border-(--color-primary-grey-dark) ${usernameError ? 'border-red-500 focus:border-red-500' : 'focus:border-brand'}`}
                        placeholder=" "
                    />
                    <label 
                        htmlFor={"email-input"} 
                        className="absolute text-sm text-body duration-300 transform -translate-y-3 scale-75 top-4.5 z-10 origin-[0] start-3.5 peer-focus:text-fg-brand peer-placeholder-shown:scale-100 peer-placeholder-shown:translate-y-0 peer-focus:scale-75 peer-focus:-translate-y-3 rtl:peer-focus:translate-x-1/4 rtl:peer-focus:left-auto text-(--color-primary-grey)">
                            {"Username"}
                    </label>
                </div>
                {usernameError && (
                    <div className="text-red-500 text-xs -mt-2">
                        {usernameError}
                    </div>
                )}
                {/* Password input */}
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
                    <div className="text-red-500 text-xs -mt-2">
                        {passwordError}
                    </div>
                )}
                <div className="text-(--color-primary-grey) text-xs -mt-2">
                    Password must contain the following:
                    <ul className="list-disc list-inside">
                        <li className={hasMinLength ? "text-green-600" : ""}>At least 8 characters</li>
                        <li className={hasSpecialChar ? "text-green-600" : ""}>A special character such as !@#$%^&amp;*</li>
                        <li className={hasUppercase ? "text-green-600" : ""}>An uppercase character</li>
                        <li className={hasLowercase ? "text-green-600" : ""}>A lowercase character</li>
                        <li className={hasNumber ? "text-green-600" : ""}>A number</li>
                    </ul>
                </div>
                {/* Retype password input */}
                <div className="relative">
                    <input 
                        id="retype-password-input"
                        value={password2}
                        type={showPassword ? "text" : "password"}
                        onChange={(e) => {
                            setPassword2(e.target.value);
                            if (passwordError) setPasswordError("");
                        }}
                        className={`block px-3.5 pb-2.5 pt-6 pr-10 w-full text-sm text-black bg-neutral-secondary-medium appearance-none focus:outline-none focus:ring-0 peer bg-white rounded-2xl border-1 border-(--color-primary-grey) hover:border-(--color-primary-grey-dark) ${passwordError ? 'border-red-500 focus:border-red-500' : 'focus:border-brand'}`}
                        placeholder=" "
                    />
                    <label 
                        htmlFor={"password-input"} 
                        className="absolute text-sm text-body duration-300 transform -translate-y-3 scale-75 top-4.5 z-10 origin-[0] start-3.5 peer-focus:text-fg-brand peer-placeholder-shown:scale-100 peer-placeholder-shown:translate-y-0 peer-focus:scale-75 peer-focus:-translate-y-3 rtl:peer-focus:translate-x-1/4 rtl:peer-focus:left-auto text-(--color-primary-grey)">
                            {"Retype password"}
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
                    <div className="text-red-500 text-xs -mt-2">
                        {passwordError}
                    </div>
                )}
                <input type="submit" value="Create Account" className="block bg-(--color-primary-blue) hover:bg-(--color-primary-blue-dark) text-sm text-white px-6 py-3 mt-6 rounded-2xl mx-auto w-full sm:w-auto cursor-pointer "/>
            </form>
            <div className="mt-6 text-(--color-primary-grey)">
                <Link to={"/login"}>
                    <div className="text-sm underline hover:text-(--color-primary-grey-dark)">Already have an account? Login</div>
                </Link>
            </div>
        </div>
    );

    return (
        <div>
            This is a placeholder for the register page.
        </div>
    );
}

export default Register;