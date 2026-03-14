/**
 * Mock file for dispatchEmail since the original is missing in the repository.
 */
const processPendingNotifications = async (userId, connection) => {
    console.log(`Mock: processPendingNotifications called for user ${userId}`);
    return true;
};

module.exports = {
    processPendingNotifications
};
