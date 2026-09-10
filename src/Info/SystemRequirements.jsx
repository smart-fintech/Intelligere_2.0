import React from 'react';

const SystemRequirements = () => {
    return (
        <React.Fragment>
            <div className="pt-3 pb-4">
                <ul className="space-y-1 divide-y divide-gray-100 text-sm text-gray-700">
                    <li className="p-2">Windows 10 or Higher</li>
                    <li className="p-2">1GHz or faster 64-bit processor</li>
                    <li className="p-2">Minimum 8 GB RAM</li>
                    <li className="p-2">Minimum 64 GB available hard disk</li>
                    <li className="p-2">
                        Preferable Tally Prime (Tally ERP will also work) License Version
                    </li>
                </ul>
            </div>
        </React.Fragment>
    );
}

export default SystemRequirements;
