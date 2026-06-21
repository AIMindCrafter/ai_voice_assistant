"""
local_mcp_server.py
-------------------
A simple local MCP server exposing a few example tools over stdio.
The LiveKit voice agent (agent.py) connects to this via MCPServerStdio.

Run this standalone to verify:
    python local_mcp_server.py

But normally it is launched automatically by the agent via MCPServerStdio.
"""

import asyncio
import datetime
import json
import httpx

from mcp.server.fastmcp import FastMCP

# Create the MCP server
mcp_server = FastMCP("Voice Agent Tools")


# ── Tool 1: Real weather (wttr.in, no API key needed) ──────────────────────
@mcp_server.tool()
async def get_weather(location: str) -> str:
    """Get the current weather for a city.

    Args:
        location: City name, e.g. 'Lahore', 'New York', 'London'
    """
    try:
        url = f"https://wttr.in/{location}?format=3"
        async with httpx.AsyncClient(timeout=5) as client:
            response = await client.get(url)
            response.raise_for_status()
            return response.text.strip()
    except Exception as e:
        return f"Sorry, I couldn't fetch the weather for {location}. Error: {e}"


# ── Tool 2: Current date and time ───────────────────────────────────────────
@mcp_server.tool()
def get_current_time(timezone: str = "UTC") -> str:
    """Get the current date and time.

    Args:
        timezone: Timezone label to include in the response, e.g. 'UTC', 'PKT', 'EST'
    """
    now = datetime.datetime.utcnow()
    formatted = now.strftime("%A, %B %d, %Y at %H:%M UTC")
    return f"The current time is {formatted}. (Requested timezone label: {timezone})"


# ── Tool 3: Unit converter ──────────────────────────────────────────────────
@mcp_server.tool()
def convert_units(value: float, from_unit: str, to_unit: str) -> str:
    """Convert a value between common units (temperature, distance, weight).

    Args:
        value: The numeric value to convert
        from_unit: Source unit (e.g. 'celsius', 'km', 'kg', 'miles', 'pounds', 'fahrenheit')
        to_unit: Target unit (e.g. 'fahrenheit', 'miles', 'pounds', 'km', 'kg', 'celsius')
    """
    from_unit = from_unit.lower().strip()
    to_unit = to_unit.lower().strip()

    conversions = {
        ("celsius", "fahrenheit"): lambda v: v * 9 / 5 + 32,
        ("fahrenheit", "celsius"): lambda v: (v - 32) * 5 / 9,
        ("km", "miles"): lambda v: v * 0.621371,
        ("miles", "km"): lambda v: v * 1.60934,
        ("kg", "pounds"): lambda v: v * 2.20462,
        ("pounds", "kg"): lambda v: v * 0.453592,
        ("meters", "feet"): lambda v: v * 3.28084,
        ("feet", "meters"): lambda v: v * 0.3048,
    }

    key = (from_unit, to_unit)
    if key in conversions:
        result = conversions[key](value)
        return f"{value} {from_unit} = {result:.4f} {to_unit}"
    else:
        supported = ", ".join(f"{a} → {b}" for a, b in conversions)
        return f"Unsupported conversion: {from_unit} to {to_unit}. Supported: {supported}"


# ── Tool 4: Simple calculator ───────────────────────────────────────────────
@mcp_server.tool()
def calculate(expression: str) -> str:
    """Evaluate a simple math expression safely.

    Args:
        expression: A math expression string, e.g. '(3 + 5) * 2', '100 / 4'
    """
    import ast
    import operator

    allowed_ops = {
        ast.Add: operator.add,
        ast.Sub: operator.sub,
        ast.Mult: operator.mul,
        ast.Div: operator.truediv,
        ast.Pow: operator.pow,
        ast.USub: operator.neg,
        ast.UAdd: operator.pos,
    }

    def _eval(node):
        if isinstance(node, ast.Constant):
            return node.value
        elif isinstance(node, ast.BinOp):
            left = _eval(node.left)
            right = _eval(node.right)
            op = allowed_ops.get(type(node.op))
            if op is None:
                raise ValueError(f"Unsupported operator: {type(node.op).__name__}")
            return op(left, right)
        elif isinstance(node, ast.UnaryOp):
            operand = _eval(node.operand)
            op = allowed_ops.get(type(node.op))
            if op is None:
                raise ValueError(f"Unsupported operator: {type(node.op).__name__}")
            return op(operand)
        else:
            raise ValueError(f"Unsupported expression node: {type(node).__name__}")

    try:
        tree = ast.parse(expression, mode="eval")
        result = _eval(tree.body)
        return f"{expression} = {result}"
    except Exception as e:
        return f"Could not calculate '{expression}': {e}"


if __name__ == "__main__":
    # When spawned by MCPServerStdio, FastMCP auto-handles stdio transport
    mcp_server.run(transport="stdio")
