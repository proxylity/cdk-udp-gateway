// Proxylity UDP Gateway — L1 (CloudFormation-faithful) CDK construct library.
//
// NOTE: there is intentionally NO `CfnDestination` export. The control-plane handler for
// `Custom::ProxylityUdpGatewayDestination` throws `NotImplementedException` (DIVERGENCES D-05), so a
// standalone Destination resource would always fail at deploy. Destinations are created inline via
// `CfnListener.destinations` (see `ListenerDestination`). It will be added when the control plane
// implements the type.

export * from './proxylity-config';
export * from './cfn-listener';
export * from './cfn-destination-arn';
export * from './cfn-packet-source';
