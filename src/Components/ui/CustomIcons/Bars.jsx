import React from "react";

const Bars = ({
    size = 24,
    strokeWidth = 2,
    className = "",
    ...props
}) => {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            className={className}
            {...props}
        >
            <path d="M4 3.5 L19 3.5" />
            <path d="M4.5 12 L16.5 12" />
            <path d="M4.5 20 L14 20" />
        </svg>
    );
};

export default Bars;

