import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarImage,
} from '@brika/clay/components/avatar';

export function AvatarDefaultDemo() {
  return (
    <Avatar>
      <AvatarImage src="https://api.dicebear.com/9.x/initials/svg?seed=Jane" alt="Jane" />
      <AvatarFallback>JD</AvatarFallback>
    </Avatar>
  );
}

export function AvatarFallbackDemo() {
  return (
    <Avatar>
      <AvatarFallback>AB</AvatarFallback>
    </Avatar>
  );
}

export function AvatarGroupDemo() {
  return (
    <AvatarGroup>
      <Avatar>
        <AvatarFallback>JD</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarFallback>AB</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarFallback>CD</AvatarFallback>
      </Avatar>
      <AvatarGroupCount>+3</AvatarGroupCount>
    </AvatarGroup>
  );
}
