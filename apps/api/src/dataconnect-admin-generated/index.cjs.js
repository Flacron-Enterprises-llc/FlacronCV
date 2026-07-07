const { validateAdminArgs } = require('firebase-admin/data-connect');

const connectorConfig = {
  connector: 'example',
  serviceId: 'flacroncv',
  location: 'us-east4'
};
exports.connectorConfig = connectorConfig;

function getMyProfile(dcOrOptions, options) {
  const { dc: dcInstance, options: inputOpts} = validateAdminArgs(connectorConfig, dcOrOptions, options, undefined);
  dcInstance.useGen(true);
  return dcInstance.executeQuery('GetMyProfile', undefined, inputOpts);
}
exports.getMyProfile = getMyProfile;

