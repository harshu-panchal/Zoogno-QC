export const maskPhoneNumber = (phone) => {
    if (!phone) return "";
    const strPhone = String(phone);
    if (strPhone.includes('*')) return strPhone; // already masked

    const digits = strPhone.replace(/\D/g, '');
    if (digits.length >= 10) {
        const last10 = digits.slice(-10);
        const isIndian = strPhone.startsWith('+91');
        const prefix = isIndian ? "+91 " : (digits.length > 10 ? `+${digits.slice(0, digits.length - 10)} ` : "");
        return `${prefix}${last10.substring(0, 2)}******${last10.substring(8)}`;
    }

    return strPhone;
};
