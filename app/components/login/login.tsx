import TextInput from "../TextInput";

function Login() {
    return (
        <div className="flex flex-col max-w-lg mx-auto">
            <img 
                src="public/bullet-logo-full.png"
                alt="The full bullet website logo. It features the handwritten text 'bullet' in all lowercase with serifs, two stars, one underneath the letters and one to the top right."
                className="w-lg flex mx-auto"
            />
            <form className="">
                <TextInput id="email-or-pass-input" label="Email or password"/>
                <TextInput id="password-input" label="Password" type="password"/>
                <input type="submit" value="Login" className=""/>
            </form>
        </div>
    );
}

export default Login;