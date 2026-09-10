import { useId, useState, type ComponentProps } from 'react';
import { EyeIcon, EyeOffIcon } from 'lucide-react';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from './input-group';

type PasswordInputProps = Omit<ComponentProps<typeof InputGroupInput>, 'type'>;

/** Campo de contraseña con botón para mostrar/ocultar. */
export function PasswordInput({ id, ...props }: PasswordInputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const [visible, setVisible] = useState(false);

  return (
    <InputGroup>
      <InputGroupInput id={inputId} type={visible ? 'text' : 'password'} {...props} />
      <InputGroupAddon align="inline-end">
        <InputGroupButton
          type="button"
          size="icon-xs"
          aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          aria-pressed={visible}
          onClick={() => setVisible((v) => !v)}
        >
          {visible ? <EyeOffIcon /> : <EyeIcon />}
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  );
}
