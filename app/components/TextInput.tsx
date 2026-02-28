import { useState } from "react";

interface TextInputProps extends React.InputHTMLAttributes<HTMLInputElement>{
    id: string,
    label?: string
}

function TextInput(props: TextInputProps) {
    const [value, setValue] = useState("");
    const { id, label, ...rest } = props;
    const isEmpty = String(props.value || "").length === 0;
    const isFilled = !isEmpty;

    return (
        <div>
            <label className="" htmlFor={id}>
                {label}
            </label>
            <input
                {...rest}
                id={id}
                value={value}
                type="text"
                onChange={(e) => setValue(e.target.value)}
                className="placeholder:text-transparent"
            />
        </div>
    );

}

export default TextInput;
