import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import AddNodeDialog from '../../components/AddNodeDialog';

describe('AddNodeDialog', () => {
  it('renders type selector and label input', () => {
    render(<AddNodeDialog onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByTestId('node-type')).toBeInTheDocument();
    expect(screen.getByTestId('node-label')).toBeInTheDocument();
  });

  it('calls onConfirm with type and label on confirm click', () => {
    const onConfirm = vi.fn();
    render(<AddNodeDialog onConfirm={onConfirm} onCancel={vi.fn()} />);
    const labelInput = screen.getByTestId('node-label') as HTMLInputElement;
    fireEvent.change(labelInput, { target: { value: 'Room 101' } });
    fireEvent.click(screen.getByTestId('node-confirm'));
    expect(onConfirm).toHaveBeenCalledWith('room', 'Room 101');
  });

  it('calls onCancel on cancel click', () => {
    const onCancel = vi.fn();
    render(<AddNodeDialog onConfirm={vi.fn()} onCancel={onCancel} />);
    fireEvent.click(screen.getByText('Отмена'));
    expect(onCancel).toHaveBeenCalled();
  });

  it('calls onConfirm on Enter key press', () => {
    const onConfirm = vi.fn();
    render(<AddNodeDialog onConfirm={onConfirm} onCancel={vi.fn()} />);
    const labelInput = screen.getByTestId('node-label');
    fireEvent.change(labelInput, { target: { value: 'Hall' } });
    fireEvent.keyDown(labelInput, { key: 'Enter' });
    expect(onConfirm).toHaveBeenCalledWith('room', 'Hall');
  });

  it('calls onCancel on Escape key press', () => {
    const onCancel = vi.fn();
    render(<AddNodeDialog onConfirm={vi.fn()} onCancel={onCancel} />);
    const labelInput = screen.getByTestId('node-label');
    fireEvent.keyDown(labelInput, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalled();
  });
});
