export const cleanAmount = (amount) => {
    return amount.replace(/[$]/g, '').replace(/[^0-9.]/g, '');
};

export const formatAmount = (amount) => {
    const formatted = new Intl.NumberFormat('fil-PH', 
        { 
            style: 'decimal',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2, 
        }).format(amount);

    return `₱${formatted}`;
};