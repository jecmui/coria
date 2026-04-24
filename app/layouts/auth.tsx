import type { ReactElement } from "react";
import { Outlet, Navigate, useLocation } from "react-router";

const Auth = ({ isAuthenticated } : { isAuthenticated: ReactElement}) => {
    const location = useLocation();

    if (!isAuthenticated) {
        return <Navigate to="/login" state={{ from: location }} replace />
    }

    return <Outlet />;
}