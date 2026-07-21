const channels = {
  console: ({ body }) => `console:${body}`,
};

export function deliver(channel, message) {
  const handler = channels[channel];
  if (!handler) throw new Error(`unknown channel: ${channel}`);
  return handler(message);
}
