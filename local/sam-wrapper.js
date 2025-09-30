const { handler } = require('../index');

exports.handler = async (event, context) => {
  try {
    const result = await handler(event, context);

    // Convert the result to API Gateway response format
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      },
      body: JSON.stringify(result),
    };
  } catch (error) {
    console.error('Error in wrapper:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        error: true,
        message: 'Internal server error',
        details: error.message,
      }),
    };
  }
};
