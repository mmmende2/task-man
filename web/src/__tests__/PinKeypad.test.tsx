import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PinKeypad } from '../components/PinKeypad';

describe('PinKeypad', () => {
  it('auto-submits on the 4th digit', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<PinKeypad onSubmit={onSubmit} />);

    await user.click(screen.getByLabelText('digit 4'));
    await user.click(screen.getByLabelText('digit 2'));
    await user.click(screen.getByLabelText('digit 4'));
    expect(onSubmit).not.toHaveBeenCalled();

    await user.click(screen.getByLabelText('digit 2'));
    // Auto-submit is deferred a tick for the dot paint — wait it out.
    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledWith('4242'));
  });

  it('backspace removes the last digit and disables when empty', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<PinKeypad onSubmit={onSubmit} />);
    const del = screen.getByLabelText('delete') as HTMLButtonElement;
    expect(del.disabled).toBe(true);

    await user.click(screen.getByLabelText('digit 1'));
    await user.click(screen.getByLabelText('digit 2'));
    expect(del.disabled).toBe(false);

    await user.click(del);
    await user.click(del);
    expect(del.disabled).toBe(true);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('clears the entered PIN when an error appears', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const { rerender } = render(<PinKeypad onSubmit={onSubmit} />);
    await user.click(screen.getByLabelText('digit 1'));
    await user.click(screen.getByLabelText('digit 2'));

    rerender(<PinKeypad onSubmit={onSubmit} error="Wrong PIN" />);
    expect(screen.getByLabelText(/PIN 0 of 4 digits/)).toBeTruthy();
    expect(screen.getByText('Wrong PIN')).toBeTruthy();
  });
});
